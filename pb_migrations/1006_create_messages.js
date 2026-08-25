/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const projectsId = app.findCollectionByNameOrId("projects").id
  const usersId = app.findCollectionByNameOrId("users").id

  const memberRead =
    "project.owner = @request.auth.id || project.project_members_via_project.user ?= @request.auth.id"

  const collection = new Collection({
    type: "base",
    name: "messages",
    // Any project member (any role) can read, post, and flag messages —
    // chat is not gated the way ticket edits are. Deletion (moderation) is
    // restricted to owner/admin.
    listRule: memberRead,
    viewRule: memberRead,
    createRule: memberRead,
    updateRule: memberRead,
    deleteRule:
      "project.owner = @request.auth.id || (project.project_members_via_project.user ?= @request.auth.id && project.project_members_via_project.role ?= 'admin')",
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
        name: "text",
        type: "text",
        required: true,
        max: 4000,
      },
      {
        name: "flagged",
        type: "bool",
      },
      {
        name: "flaggedBy",
        type: "relation",
        collectionId: usersId,
        maxSelect: 1,
      },
      {
        name: "flaggedAt",
        type: "date",
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
      },
    ],
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("messages")
  app.delete(collection)
})
