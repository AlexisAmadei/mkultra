/// <reference path="../pb_data/types.d.ts" />

// Adds "sticky" as a selectable card type.
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId("cards");
    const field = cards.fields.getByName("type");
    field.values = ["text", "photo", "document", "sticky"];
    app.save(cards);
  },
  (app) => {
    const cards = app.findCollectionByNameOrId("cards");
    const field = cards.fields.getByName("type");
    field.values = ["text", "photo", "document"];
    app.save(cards);
  },
);
