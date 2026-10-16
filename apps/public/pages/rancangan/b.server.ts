import { defineHandler } from "void";
import { designFixture } from "~/design/fixture";

export const loader = defineHandler(() => {
  const { generatedAt, feeds, detections, guidance } = designFixture();
  return { generatedAt, feeds, detections, guidance };
});
