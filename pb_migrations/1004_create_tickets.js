/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const projectsId = app.findCollectionByNameOrId("projects").id

  const memberRead =
    "project.owner = @request.auth.id || project.project_members_via_project.user ?= @request.auth.id"
  const memberWrite =
    "project.owner = @request.auth.id || (project.project_members_via_project.user ?= @request.auth.id && project.project_members_via_project.role ?= 'admin')"

  const collection = new Collection({
    type: "base",
    name: "tickets",
    listRule: memberRead,
    viewRule: memberRead,
    createRule: memberWrite,
    updateRule: memberWrite,
    deleteRule: memberWrite,
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
        // Stable id derived from the ticket's filename on disk
        // (.agenpic/tickets/<slug>.json), used by the file watcher to
        // upsert without creating duplicates.
        name: "slug",
        type: "text",
        required: true,
        max: 200,
      },
      {
        name: "title",
        type: "text",
        required: true,
        max: 300,
      },
      {
        name: "description",
        type: "text",
        max: 20000,
      },
      {
        name: "column",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["backlog", "todo", "in_progress", "done"],
      },
      {
        name: "order",
        type: "number",
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
    indexes: [
      "CREATE UNIQUE INDEX idx_tickets_project_slug ON tickets (project, slug)",
    ],
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("tickets")
  app.delete(collection)
})
