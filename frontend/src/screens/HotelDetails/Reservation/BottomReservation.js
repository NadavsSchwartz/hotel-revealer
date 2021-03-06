import React, { useState } from 'react';
import { IoIosClose } from 'react-icons/io';
import Rating from '../../../components/UI/Rating/Rating';
import { Button, Modal } from 'antd';
import StickyBooking from '../../../components/StickyBooking/StickyBooking';
import Reservation from './Reservation';

const BottomReservation = ({
  title,
  price,
  rating,
  ratingCount,
  linkToBook,
  isRoomAvailable,
}) => {
  // const [visible, setVisible] = useState(false);

  return (
    <>
      <StickyBooking
        logo="/images/logo-alt.svg"
        title={title}
        price={price}
        rating={
          <Rating guestRating={rating} ratingCount={ratingCount} type="bulk" />
        }
        action={
          <Button
            type="primary"
            // onClick={() => setVisible(true)}
            disabled={!isRoomAvailable}
          >
            {isRoomAvailable ? (
              <a href={linkToBook}>Book</a>
            ) : (
              'No Longer Avaialble'
            )}
          </Button>
        }
      />
      {/* 
      <Modal
        visible={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        maskStyle={{
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
        }}
        wrapClassName="reservation_modal"
        closable={false}
      >
        <Reservation
          price={price}
          linkToBook={linkToBook}
          isRoomAvailable={isRoomAvailable}
        />
        <Button onClick={() => setVisible(false)} className="close">
          <IoIosClose />
        </Button>
      </Modal> */}
    </>
  );
};

export default BottomReservation;
