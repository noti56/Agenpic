/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("projects")
  collection.listRule =
    "owner = @request.auth.id || project_members_via_project.user ?= @request.auth.id"
  collection.viewRule =
    "owner = @request.auth.id || project_members_via_project.user ?= @request.auth.id"
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects")
  collection.listRule = "owner = @request.auth.id"
  collection.viewRule = "owner = @request.auth.id"
  app.save(collection)
})
