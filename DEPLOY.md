# Publishing this to GitHub Pages

Five minutes, no cost, no server.

## 1. Create an empty repository

On GitHub, create a new **public** repository. Do not add a README, a licence or a
`.gitignore` — this folder already has them. Note the name you choose; it becomes part of
the URL.

## 2. Push this folder

From inside this folder:

```sh
git init -b main
git add -A
git commit -m "Méid: searchable front end over the archived Benefacts data"
git remote add origin https://github.com/KilleensRock/meid.git
git push -u origin main
```

If `git push` asks for a password, GitHub wants a personal access token rather than your
account password: **Settings → Developer settings → Personal access tokens → Fine-grained
tokens**, with Contents: read and write on this repository.

## 3. Turn on Pages

In the repository: **Settings → Pages**. Under *Build and deployment*, set Source to
**Deploy from a branch**, branch **main**, folder **/ (root)**, and Save.

The site appears at `https://killeensrock.github.io/meid/` within a couple of
minutes. The `.nojekyll` file in this folder tells GitHub to serve the files as they are
rather than running them through Jekyll — leave it in place.

## 4. Point a domain at it (optional)

Once you have settled on a working title and registered a domain:

1. Create a file named `CNAME` in this folder containing just the domain, e.g.
   `register.example.ie`, and push it.
2. At your registrar, add a CNAME record for that hostname pointing to
   `killeensrock.github.io`. For a bare domain, add four A records instead, to
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`.
3. In **Settings → Pages**, enter the domain and tick **Enforce HTTPS** once the
   certificate has been issued. That can take up to an hour.

## Updating the site later

Push to `main` and the site redeploys. To regenerate the data after a refresh of the
source spreadsheets, see `README.md` — `sh build/all.sh` rebuilds `data/` and
`index.html`, then commit and push as normal.

## What to watch

- **Repository size.** This is about 18 MB, well inside limits. If a future refresh adds
  several more years of accounts, check the size before pushing; GitHub warns past 1 GB.
- **Bandwidth.** GitHub Pages has a soft limit of 100 GB a month. At roughly 3 MB per
  visitor who loads every view, that is tens of thousands of visits — but if the site is
  ever written about widely, put Cloudflare in front of it. The files do not change.
- **Do not rename the files under `data/`.** They are gzip-compressed but named `.json`
  on purpose; `README.md` explains why.
