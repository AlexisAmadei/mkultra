/// <reference path="../pb_data/types.d.ts" />

// Creates the `cards` and `connections` collections for the corkboard.
// Public access rules ("") — this is a local, unauthenticated tool.
migrate(
  (app) => {
    const cards = new Collection({
      type: "base",
      name: "cards",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { name: "type", type: "select", required: false, maxSelect: 1, values: ["text", "photo", "document"] },
        { name: "title", type: "text", required: false },
        { name: "body", type: "text", required: false },
        { name: "url", type: "url", required: false },
        { name: "image", type: "file", required: false, maxSelect: 1, maxSize: 10485760 },
        { name: "attachment", type: "file", required: false, maxSelect: 1, maxSize: 52428800 },
        { name: "x", type: "number", required: false },
        { name: "y", type: "number", required: false },
        { name: "width", type: "number", required: false },
        { name: "height", type: "number", required: false },
        { name: "rotation", type: "number", required: false },
        { name: "color", type: "text", required: false },
        { name: "z", type: "number", required: false },
      ],
    });
    app.save(cards);

    const connections = new Collection({
      type: "base",
      name: "connections",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { name: "fromCard", type: "relation", required: true, maxSelect: 1, collectionId: cards.id, cascadeDelete: true },
        { name: "toCard", type: "relation", required: true, maxSelect: 1, collectionId: cards.id, cascadeDelete: true },
        { name: "color", type: "text", required: false },
        { name: "label", type: "text", required: false },
      ],
    });
    app.save(connections);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("connections"));
    app.delete(app.findCollectionByNameOrId("cards"));
  },
);
