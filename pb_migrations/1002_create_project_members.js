/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const projectsId = app.findCollectionByNameOrId("projects").id
  const usersId = app.findCollectionByNameOrId("users").id

  const collection = new Collection({
    type: "base",
    name: "project_members",
    listRule: "project.owner = @request.auth.id || user = @request.auth.id",
    viewRule: "project.owner = @request.auth.id || user = @request.auth.id",
    createRule: "project.owner = @request.auth.id",
    updateRule: "project.owner = @request.auth.id",
    deleteRule: "project.owner = @request.auth.id",
    fields: [
      {
        name: "project",
        type: "relation",
        required: true,
        collectionId: projectsId,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "user",
        type: "relation",
        required: true,
        collectionId: usersId,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "role",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["admin", "viewer"],
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_project_members_unique ON project_members (project, user)",
    ],
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("project_members")
  app.delete(collection)
})
