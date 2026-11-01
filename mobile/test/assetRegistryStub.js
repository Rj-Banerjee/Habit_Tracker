// React Native 0.88 no longer ships this module separately, and Metro resolves
// it for the real app. Only image assets use it, and no test draws one.
module.exports = { getAssetByID: () => undefined };
