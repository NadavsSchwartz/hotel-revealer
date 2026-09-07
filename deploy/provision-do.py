#!/usr/bin/env python3
"""Review a DigitalOcean VPS plan; --apply explicitly creates billable resources."""
import argparse
import ipaddress
import json
import pathlib
import re
import subprocess
import tempfile


def public_key(filename):
    text = pathlib.Path(filename).read_text().strip()
    if not re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]+={0,2}( [^\r\n]*)?", text):
        raise ValueError("Use a single plain Ed25519 public key, without authorized_keys options")
    subprocess.run(["ssh-keygen", "-l", "-f", str(filename)], check=True, capture_output=True)
    # Comments are unnecessary and might contain YAML or shell syntax.
    return " ".join(text.split()[:2])


def doctl(*args):
    result = subprocess.run(["doctl", *args, "--output", "json"], check=True,
                            text=True, capture_output=True)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="hotel-revealer")
    parser.add_argument("--region", default="sfo3")
    parser.add_argument("--admin-key", required=True, type=pathlib.Path)
    parser.add_argument("--deploy-key", required=True, type=pathlib.Path)
    parser.add_argument("--ssh-key-id", required=True, help="Existing DigitalOcean admin SSH key ID")
    parser.add_argument("--ssh-cidr", action="append",
                        help="Optional SSH source CIDR; repeat for admin/CI. Default: public IPv4 with key-only SSH")
    parser.add_argument("--render", type=pathlib.Path, help="Save rendered cloud-init locally for review")
    parser.add_argument("--apply", action="store_true", help="Create a tag, cloud firewall and billable Droplet")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,50}", args.name):
        parser.error("name must be 2-51 lowercase letters, digits or hyphens")
    if not re.fullmatch(r"[a-z]{3}[0-9]", args.region):
        parser.error("region must be a DigitalOcean region slug")
    if not re.fullmatch(r"[1-9][0-9]*", args.ssh_key_id):
        parser.error("ssh-key-id must be a numeric existing DigitalOcean key ID")
    networks = [ipaddress.ip_network(value, strict=True) for value in (args.ssh_cidr or ["0.0.0.0/0"])]
    cidrs = sorted(set(str(network) for network in networks))
    admin_key, deploy_key = public_key(args.admin_key), public_key(args.deploy_key)
    if admin_key == deploy_key:
        parser.error("Use different administrator and restricted deployment keys")
    template = pathlib.Path(__file__).with_name("cloud-init.yaml").read_text()
    restricted = 'restrict,command="/usr/local/bin/hotel-revealer-ssh" ' + deploy_key
    rendered = template.replace("__ADMIN_PUBLIC_KEY__", json.dumps(admin_key))
    rendered = rendered.replace("__RESTRICTED_DEPLOY_PUBLIC_KEY__", json.dumps(restricted))
    rendered = rendered.replace("__SSH_UFW_RULES__", "\n      ".join(
        f"ufw allow from {cidr} to any port 22 proto tcp" for cidr in cidrs))
    if "__" in rendered:
        raise ValueError("Unresolved cloud-init template token")
    if args.render:
        # Exclusive creation avoids overwriting operator files.
        with args.render.open("x") as output:
            output.write(rendered)
        args.render.chmod(0o600)
    tag = args.name + "-vps"
    inbound = [f"protocol:tcp,ports:22,address:{cidr}" for cidr in cidrs]
    for port in (80, 443):
        inbound.extend(f"protocol:tcp,ports:{port},address:{cidr}" for cidr in ("0.0.0.0/0", "::/0"))
    outbound = [f"protocol:{protocol},ports:all,address:{cidr}"
                for protocol in ("tcp", "udp") for cidr in ("0.0.0.0/0", "::/0")]
    outbound.extend(f"protocol:icmp,address:{cidr}" for cidr in ("0.0.0.0/0", "::/0"))
    print(json.dumps({"apply": args.apply, "name": args.name, "region": args.region,
                      "image": "ubuntu-24-04-x64", "size": "s-1vcpu-1gb",
                      "sshSources": cidrs, "publicTCPPorts": [80, 443], "tag": tag}, indent=2))
    if not args.apply:
        print("DRY RUN: no cloud API calls or purchases. Review current pricing and availability before --apply.")
        return
    # Fail on existing resources instead of adopting or modifying someone else's host.
    for kind, name in (("droplet", args.name), ("firewall", tag), ("tag", tag)):
        if any(item["name"] == name for item in doctl("compute", kind, "list")):
            raise ValueError(f"Existing {kind} named {name}; inspect it before retrying")
    print("Creating a billable VPS. No automatic deletion on partial failure.")
    doctl("compute", "tag", "create", tag)
    firewall = doctl("compute", "firewall", "create", "--name", tag, "--tag-names", tag,
                     "--inbound-rules", " ".join(inbound), "--outbound-rules", " ".join(outbound))
    print("Firewall created:", firewall[0]["id"])
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml") as userdata:
        userdata.write(rendered)
        userdata.flush()
        droplets = doctl("compute", "droplet", "create", args.name, "--region", args.region,
                          "--image", "ubuntu-24-04-x64", "--size", "s-1vcpu-1gb",
                          "--ssh-keys", args.ssh_key_id, "--tag-names", tag,
                          "--user-data-file", userdata.name, "--wait")
    print("Droplet created:", droplets[0]["id"])
    print("Verify cloud-init and SSH host key via the provider console. Nothing has been deployed.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Do not print doctl captured stdout/stderr or credential-bearing arguments.
        raise SystemExit(f"Provisioning stopped: {type(error).__name__}. Check the plan and cloud resource inventory before retrying.") from None
