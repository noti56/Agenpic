/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("projects")
  collection.fields.removeByName("claude_md")
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects")
  collection.fields.add(
    new TextField({
      name: "claude_md",
      max: 200000,
    }),
  )
  app.save(collection)
})
