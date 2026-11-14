# Deploy (Cloud Run)

Prereqs: a Google Cloud project with billing enabled, and `gcloud` logged in. Enable these APIs:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com texttospeech.googleapis.com
```

Store the key as a secret, not as a plain env var:

```bash
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
```

The Cloud Run runtime service account needs access to the secret. By default that is the Compute Engine default SA:

```bash
gcloud secrets add-iam-policy-binding gemini-api-key --member="serviceAccount:$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
```

Deploy from the repo root. This uses the `Dockerfile`:

```bash
gcloud run deploy wildlife-described --source . --region us-central1 --allow-unauthenticated --min-instances 1 --set-secrets GEMINI_API_KEY=gemini-api-key:latest --set-env-vars MOCK=0,GEMINI_MODEL=gemini-2.5-flash
```

`--min-instances 1` avoids a cold start in the middle of the demo. It costs a little while it runs, so set it back to 0 after the event.

Check it with `curl https://<service-url>/api/health`, then `npm run smoke -- --base=https://<service-url> path/to/trex.jpg`.

**TTS key:** `/api/speak` uses `GOOGLE_TTS_API_KEY`, falling back to `GEMINI_API_KEY`. That works only if the key's project has the Text-to-Speech API enabled and the key isn't restricted to the Gemini API. If speak returns 502, create a separate key for TTS and add it as a second secret.

**Fallback if Cloud Run fights you:** Firebase App Hosting deploys Next.js straight from GitHub. Set the same secret there. Don't spend more than 30 minutes on hosting. A laptop running `npm run build && npm start` behind `npx localtunnel` or similar still demos.
