/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  // Any authenticated user can look up another user by email (needed for
  // the "invite by email" flow) and view basic profile fields. Password
  // hashes are never exposed by PocketBase regardless of this rule.
  users.listRule = "@request.auth.id != ''"
  users.viewRule = "@request.auth.id != ''"
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  app.save(users)
})
