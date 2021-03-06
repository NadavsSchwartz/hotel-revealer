import React from 'react';
import { FiExternalLink } from 'react-icons/fi';
import TextLink from '../UI/TextLink/TextLink';
import Rating from '../UI/Rating/Rating';
import Carousel from 'react-multi-carousel';
import 'react-multi-carousel/lib/styles.css';
import GridCard from '../GridCard/GridCard';
import { encrypt } from '../../utils';
import { PostPlaceholder } from '../UI/ContentLoader/ContentLoader';

const responsive = {
  desktop: {
    breakpoint: {
      max: 3000,
      min: 1024,
    },
    items: 1,
    paritialVisibilityGutter: 40,
  },
  mobile: {
    breakpoint: {
      max: 464,
      min: 0,
    },
    items: 1,
    paritialVisibilityGutter: 30,
  },
  tablet: {
    breakpoint: {
      max: 1024,
      min: 464,
    },
    items: 1,
    paritialVisibilityGutter: 30,
  },
};

const PostGrid = ({
  hotelName,
  totalReviewCount,
  location,
  expressDealDailyPrice,
  expressDealPricePerStay,
  starRating,
  thumbnailUrl,
  hotelId,
  checkIn,
  overallGuestRating,
  checkOut,
  cityId,
  pclnId,
  isAvailable,
}) => {
  const body = { checkIn, checkOut, pclnId, hotelId, hotelName };
  let link = encrypt(body);

  return (
    <GridCard
      isCarousel={true}
      location={
        location && location.neighborhoodName ? location.neighborhoodName : ''
      }
      title={<TextLink link={`/deal?q=${link}`} content={hotelName} />}
      price={
        isAvailable
          ? '$' +
            expressDealDailyPrice +
            '/ Night - $' +
            expressDealPricePerStay +
            ' ' +
            'Total'
          : 'Hotel Not Available'
      }
      rating={
        <Rating
          rating={starRating}
          ratingCount={totalReviewCount}
          type="bulk"
          guestRating={overallGuestRating}
        />
      }
      viewDetailsBtn={
        <TextLink
          link={`/deal?q=${link}}`}
          icon={<FiExternalLink />}
          content="Details"
        />
      }
      goToPricelineBtn={
        cityId && (
          <TextLink
            link={
              isAvailable
                ? `https://www.priceline.com/relax/at/express/${cityId}/${pclnId}/from/${checkIn}/to/${checkOut}/rooms/1?cur=USD}`
                : ''
            }
            icon={<FiExternalLink />}
            content={isAvailable ? 'Book' : 'Unavailable'}
            target="_blank"
            isAvailable={isAvailable}
          />
        )
      }
    >
      <Carousel
        additionalTransfrom={0}
        arrows
        autoPlaySpeed={3000}
        containerClass="container"
        dotListClass=""
        draggable
        focusOnSelect={false}
        infinite
        itemClass=""
        renderDotsOutside={false}
        responsive={responsive}
        showDots={true}
        sliderClass=""
        slidesToSlide={1}
      >
        <img
          src={thumbnailUrl ? thumbnailUrl : <PostPlaceholder />}
          alt={'thumbnail'}
          draggable={false}
          key={1}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            position: 'relative',
          }}
        />
      </Carousel>
    </GridCard>
  );
};

export default PostGrid;
