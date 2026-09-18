/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("project_members")
  const newRule =
    "project.owner = @request.auth.id || user = @request.auth.id || project.project_members_via_project.user ?= @request.auth.id"

  collection.listRule = newRule
  collection.viewRule = newRule
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("project_members")
  const oldRule = "project.owner = @request.auth.id || user = @request.auth.id"

  collection.listRule = oldRule
  collection.viewRule = oldRule
  app.save(collection)
})
