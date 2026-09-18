/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const projectsId = app.findCollectionByNameOrId("projects").id
  const usersId = app.findCollectionByNameOrId("users").id

  const memberRead =
    "project.owner = @request.auth.id || project.project_members_via_project.user ?= @request.auth.id"

  const collection = new Collection({
    type: "base",
    name: "presence_status",
    // Anyone with project access can see everyone's status; only the human
    // themselves can set theirs, including their Claude Code sessions'
    // (the CLI authenticates as that same human's own PocketBase account).
    listRule: memberRead,
    viewRule: memberRead,
    createRule: "user = @request.auth.id && (" + memberRead + ")",
    updateRule: "user = @request.auth.id && (" + memberRead + ")",
    deleteRule: "user = @request.auth.id && (" + memberRead + ")",
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
        name: "kind",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["user", "agent"],
      },
      {
        name: "status",
        type: "text",
        max: 80,
      },
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_presence_status_project_user_kind ON presence_status (project, user, kind)",
    ],
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("presence_status")
  app.delete(collection)
})
