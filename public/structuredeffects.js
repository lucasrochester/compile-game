export const structuredEffects = {
  "Life 0": {
    topEffect: [
      { action: "conditionalOnCovered", effects: [{ action: "deleteSelf" }] }
    ],
    middleEffect: [
      { action: "playTopDeckFaceDown", targetPlayer: "self", targetLine: "eachLineWithCard" }
    ],
    bottomEffect: []
  },
  "Life 1": {
    topEffect: [],
    middleEffect: [
      { action: "flip", amount: 1, targetPlayer: "self", targetCardState: "faceDown", targetLocation: "field", targetLine: "any" },
      { action: "flip", amount: 1, targetPlayer: "self", targetCardState: "faceDown", targetLocation: "field", targetLine: "any" }
    ],
    bottomEffect: []
  },
  // ... include ALL your cards similarly (I can provide full if you want)
};
