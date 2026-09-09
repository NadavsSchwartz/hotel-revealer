import React, { useState } from 'react';
import Modal from 'antd/es/modal';
import 'antd/es/modal/style/css';
import './property-photos.css';

export default function PropertyPhotos({ images, name }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [failedImages, setFailedImages] = useState([]);
  const previews = images.slice(0, 4).filter((image) => !failedImages.includes(image));
  const activeIndex = selectedIndex === null ? null : Math.min(selectedIndex, images.length - 1);
  const activeImage = images[activeIndex];
  const caption = 'Property photos may not show the room included in the Express offer.';
  const recordFailure = (image) => setFailedImages((failed) => (
    failed.includes(image) ? failed : [...failed, image]
  ));
  const move = (offset) => setSelectedIndex(
    Math.max(0, Math.min(images.length - 1, activeIndex + offset)),
  );
  const openPhoto = (index, event) => {
    event.currentTarget.focus({ preventScroll: true });
    setSelectedIndex(index);
  };

  if (!images.length) return null;

  return (
    <>
      <div className="property-photos">
        {previews.length > 0 && (
          <div className={`property-photo-grid property-photo-grid-${previews.length}`} aria-label="Named hotel photographs">
            {previews.map((image) => (
              <button type="button" key={image} onClick={(event) => openPhoto(images.indexOf(image), event)}>
                <img
                  src={image}
                  alt={`${name || 'Named hotel'}, property photograph ${images.indexOf(image) + 1}`}
                  width="960"
                  height="640"
                  loading={image === images[0] ? 'eager' : 'lazy'}
                  referrerPolicy="no-referrer"
                  onError={() => recordFailure(image)}
                />
              </button>
            ))}
          </div>
        )}
        {images.some((image) => !failedImages.includes(image)) && (
          <div className="property-photos-caption">
            <p>{caption}</p>
            <button type="button" onClick={(event) => openPhoto(images.findIndex((image) => !failedImages.includes(image)), event)}>
              {images.length === 1 ? 'View photo' : `View all ${images.length} photos`}
            </button>
          </div>
        )}
      </div>
      <Modal
        className="property-photo-modal"
        title={`${name || 'Hotel'} photos`}
        open={activeIndex !== null}
        onCancel={() => setSelectedIndex(null)}
        footer={null}
        width={960}
        centered
        destroyOnClose
        modalRender={(dialog) => (
          <div onKeyDown={(event) => {
            if (activeIndex !== null && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
              event.preventDefault();
              move(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}>{dialog}</div>
        )}
      >
        {activeImage && (
          <>
            <div className="property-photo-stage">
              {failedImages.includes(activeImage) ? <p role="status">This photo couldn’t load. Try another photo.</p> : (
                <img key={activeImage} src={activeImage} alt={`${name || 'Named hotel'}, property photograph ${activeIndex + 1}`} referrerPolicy="no-referrer" onError={() => recordFailure(activeImage)} />
              )}
            </div>
            <div className="property-photo-navigation">
              <button type="button" onClick={() => move(-1)} aria-disabled={activeIndex === 0}>Previous</button>
              <span role="status" aria-live="polite">{activeIndex + 1} of {images.length}</span>
              <button type="button" onClick={() => move(1)} aria-disabled={activeIndex === images.length - 1}>Next</button>
            </div>
            <p className="property-photo-note">{caption}</p>
          </>
        )}
      </Modal>
    </>
  );
}
