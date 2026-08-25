/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "projects",
    // listRule/viewRule are widened to include project_members in
    // 1003_update_projects_rules.js, once that collection exists.
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: "@request.auth.id != '' && owner = @request.auth.id",
    updateRule: "owner = @request.auth.id",
    deleteRule: "owner = @request.auth.id",
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        max: 200,
      },
      {
        name: "path",
        type: "text",
        required: true,
        max: 1000,
      },
      {
        name: "owner",
        type: "relation",
        required: true,
        collectionId: app.findCollectionByNameOrId("users").id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
      },
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects")
  app.delete(collection)
})
