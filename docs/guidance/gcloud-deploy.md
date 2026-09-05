# Re-deploy Backend to Google Cloud Run

Project: `csi-wf-506110` | Service: `csi-wf-backend` | Region: `asia-south1`

## One-time (per shell session)

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
```

## Deploy

Run from the repo root (`/home/kgd122/personal/CSI-WF`):

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH" && \
gcloud run deploy csi-wf-backend --source . --region=asia-south1 --project=csi-wf-506110
```

## Check status / logs

```bash
gcloud run services describe csi-wf-backend --region=asia-south1 --project=csi-wf-506110

gcloud run services logs read csi-wf-backend --region=asia-south1 --project=csi-wf-506110 --limit=100
```

## Service URL

``` bash
https://csi-wf-backend-483024467572.asia-south1.run.app
```

## Auth check

```bash
gcloud auth list
gcloud config get-value project
```

## Notes

- Do NOT pass `--set-env-vars` or `--clear-env-vars` unless you intend to change env vars — existing ones (`DATABASE_URL`, `JWT_SECRET`, `GCS_BUCKET`) persist automatically across deploys.
- Always pass `--project=csi-wf-506110` explicitly — the shell's default active project is `kitchenplanner-506110`.
- `render.yaml` in the repo is unused — ignore it.
