/** Medicine bill maths (services/pricingService.js#pharmacyTotals). */
const { pharmacyTotals } = require('../../../services/pricingService');

describe('pharmacyTotals', () => {
  it('discount comes off the items, credit off what is left, and total is what the customer pays', () => {
    expect(pharmacyTotals({ itemsSubtotal: 100, deliveryFee: 25, discount: 10, credit: 30 })).toEqual({ discount: 10, credit: 30, total: 85 });
  });

  it('credit never takes the bill below zero, and a discount never exceeds the items', () => {
    expect(pharmacyTotals({ itemsSubtotal: 20, deliveryFee: 25, credit: 100 })).toEqual({ discount: 0, credit: 45, total: 0 });
    expect(pharmacyTotals({ itemsSubtotal: 20, deliveryFee: 25, discount: 50 })).toEqual({ discount: 20, credit: 0, total: 25 });
  });

  it('works without credit, as before', () => {
    expect(pharmacyTotals({ itemsSubtotal: 99.995, deliveryFee: 0 })).toEqual({ discount: 0, credit: 0, total: 100 });
    expect(pharmacyTotals({ itemsSubtotal: 50, credit: -5 })).toEqual({ discount: 0, credit: 0, total: 50 });
  });
});
