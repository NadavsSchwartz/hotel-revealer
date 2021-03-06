import React from 'react';
import PropTypes from 'prop-types';
import GridCardWrapper, {
  ImageWrapper,
  FavoriteIcon,
  ContentWrapper,
  LocationArea,
  TitleArea,
  PriceArea,
  RatingArea,
  MetaWrapper,
  ButtonGroup,
} from './GridCard.style';
import { Divider } from 'antd';

const GridCard = ({
  className,
  favorite,
  location,
  title,
  price,
  rating,
  viewDetailsBtn,
  goToPricelineBtn,
  children,
}) => {
  let classes =
    viewDetailsBtn || goToPricelineBtn ? `has_btn ${className}` : className;
  return (
    <GridCardWrapper className={`grid_card ${classes}`.trim()}>
      <ImageWrapper className="media_wrapper">{children}</ImageWrapper>
      <ContentWrapper className="content_wrapper">
        {location && <LocationArea>{location}</LocationArea>}
        {title && <TitleArea>{title}</TitleArea>}
        <MetaWrapper className="meta_wrapper">
          {price && <PriceArea className="price">{price}</PriceArea>}
          {rating && <RatingArea className="rating">{rating}</RatingArea>}
          {viewDetailsBtn || goToPricelineBtn ? (
            <>
              <ButtonGroup className="button_group">
                {goToPricelineBtn}
                <Divider type="vertical" />
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: '800',
                    float: 'right',
                  }}
                >
                  {viewDetailsBtn}
                </div>
              </ButtonGroup>
            </>
          ) : null}
        </MetaWrapper>
      </ContentWrapper>

      {favorite && <FavoriteIcon>{favorite}</FavoriteIcon>}
    </GridCardWrapper>
  );
};

GridCard.propTypes = {
  className: PropTypes.string,
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
  price: PropTypes.string,
  rating: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
  location: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
  editBtn: PropTypes.element,
  viewDetailsBtn: PropTypes.element,
};

export default GridCard;
