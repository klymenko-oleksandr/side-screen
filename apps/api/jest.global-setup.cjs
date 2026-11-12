/** Tests run in Kyiv time, like the Mac, so 'today' and slot maths match. */
module.exports = () => {
  process.env.TZ = 'Europe/Kyiv';
};
