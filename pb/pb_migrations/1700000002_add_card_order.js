/// <reference path="../pb_data/types.d.ts" />

// Adds an `order` number field to cards for presentation sequencing (0 = unassigned).
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId("cards");
    cards.fields.add(new Field({ name: "order", type: "number", required: false }));
    app.save(cards);
  },
  (app) => {
    const cards = app.findCollectionByNameOrId("cards");
    cards.fields.removeByName("order");
    app.save(cards);
  },
);
