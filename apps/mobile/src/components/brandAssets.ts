import Constants from "expo-constants";
import { mobileForkBrand } from "../lib/mobileProductBrand";

export { MOBILE_PRODUCT_NAME } from "../lib/mobileProductBrand";

const appVariant = Constants.expoConfig?.extra?.appVariant;

export const T3_CODE_BRAND_MARK_SOURCE = mobileForkBrand
  ? require("../../../../assets/fork/j3/icon-1024.png")
  : appVariant === "development"
    ? require("../../../../assets/dev/blueprint-ios-1024.png")
    : appVariant === "preview"
      ? require("../../../../assets/nightly/nightly-ios-1024.png")
      : require("../../../../assets/prod/black-ios-1024.png");
