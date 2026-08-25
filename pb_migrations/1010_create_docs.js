/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const projectsId = app.findCollectionByNameOrId("projects").id

  const memberRead =
    "project.owner = @request.auth.id || project.project_members_via_project.user ?= @request.auth.id"
  const memberWrite =
    "project.owner = @request.auth.id || (project.project_members_via_project.user ?= @request.auth.id && project.project_members_via_project.role ?= 'admin')"

  const collection = new Collection({
    type: "base",
    name: "docs",
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
        // Stable id used by the CLI to address a doc without knowing its
        // PocketBase record id.
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
        name: "content",
        type: "text",
        max: 200000,
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
      "CREATE UNIQUE INDEX idx_docs_project_slug ON docs (project, slug)",
    ],
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("docs")
  app.delete(collection)
})
