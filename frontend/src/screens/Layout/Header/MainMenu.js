import React from 'react';
import { NavLink } from 'react-router-dom';
import { Menu } from 'antd';

const MainMenu = ({ className }) => {
  return (
    <Menu className={className}>
      <Menu.Item key="0">
        <NavLink to="/privacy">Privacy</NavLink>
      </Menu.Item>
    </Menu>
  );
};

export default MainMenu;
