import { defineHandler } from "void";
import { designFixture } from "~/design/fixture";

export const loader = defineHandler(() => designFixture());
