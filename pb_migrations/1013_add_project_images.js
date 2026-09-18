/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("projects")

  // Stored as base64 data URIs, not PocketBase file fields — these are
  // small (client-side resized to a 256x256 square before upload, see
  // apps/desktop/src/lib/imageToDataUrl.ts), so keeping them as plain
  // fields on the record avoids a separate file-storage/serving path
  // entirely. `max` is a generous ceiling on the resized payload, not a
  // target size.
  collection.fields.add(
    new TextField({
      name: "image",
      max: 400000,
    }),
  )
  collection.fields.add(
    new TextField({
      // No organizations exist yet — this is a placeholder ref on the
      // project for when they do, not tied to any org entity today.
      name: "orgImage",
      max: 400000,
    }),
  )
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects")
  const image = collection.fields.getByName("image")
  if (image) collection.fields.removeById(image.id)
  const orgImage = collection.fields.getByName("orgImage")
  if (orgImage) collection.fields.removeById(orgImage.id)
  app.save(collection)
})
