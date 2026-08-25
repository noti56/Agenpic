/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("tickets")
  const usersId = app.findCollectionByNameOrId("users").id

  collection.fields.add(
    new RelationField({
      name: "owner",
      collectionId: usersId,
      cascadeDelete: false,
      maxSelect: 1,
    }),
  )
  collection.fields.add(
    new FileField({
      name: "images",
      maxSelect: 6,
      maxSize: 8388608, // 8MB
      mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    }),
  )
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("tickets")
  const owner = collection.fields.getByName("owner")
  if (owner) collection.fields.removeById(owner.id)
  const images = collection.fields.getByName("images")
  if (images) collection.fields.removeById(images.id)
  app.save(collection)
})
