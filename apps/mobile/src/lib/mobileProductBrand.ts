import { resolveForkBrand } from "@t3tools/shared/forkBrand";
import Constants from "expo-constants";

export const mobileForkBrand = resolveForkBrand(Constants.expoConfig?.extra?.brand);
export const MOBILE_PRODUCT_NAME = mobileForkBrand?.name ?? "T3 Code";
