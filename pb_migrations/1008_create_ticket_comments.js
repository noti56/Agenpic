/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const ticketsId = app.findCollectionByNameOrId("tickets").id
  const usersId = app.findCollectionByNameOrId("users").id

  const memberRead =
    "ticket.project.owner = @request.auth.id || ticket.project.project_members_via_project.user ?= @request.auth.id"

  const collection = new Collection({
    type: "base",
    name: "ticket_comments",
    listRule: memberRead,
    viewRule: memberRead,
    createRule: memberRead,
    updateRule: "user = @request.auth.id",
    deleteRule:
      "user = @request.auth.id || ticket.project.owner = @request.auth.id || (ticket.project.project_members_via_project.user ?= @request.auth.id && ticket.project.project_members_via_project.role ?= 'admin')",
    fields: [
      {
        name: "ticket",
        type: "relation",
        required: true,
        collectionId: ticketsId,
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
        name: "created",
        type: "autodate",
        onCreate: true,
      },
    ],
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("ticket_comments")
  app.delete(collection)
})
