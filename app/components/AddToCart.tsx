'use client';
import React from 'react'

const AddToCart = () => {
  return (
    <div>
      <button onClick={ () => { console.log(
        "Product added to cart"
      )}}>Add to Cart</button>
    </div>
  )
}

export default AddToCart
