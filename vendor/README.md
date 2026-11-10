SDK officiel Anthropic pour JavaScript (@anthropic-ai/sdk 1.8.0, licence Apache-2.0),
empaqueté en un seul module ES pour le navigateur :

  npm install @anthropic-ai/sdk@1.8.0 esbuild
  echo "export { default } from '@anthropic-ai/sdk';" > entry.js
  npx esbuild entry.js --bundle --format=esm --platform=browser --minify --target=es2020 --outfile=anthropic-sdk.js

Chargé à la demande (premier appel IA) par js/ai/client.js. Embarqué plutôt que chargé depuis un CDN :
la clé API de l'utilisateur ne doit pas dépendre d'un serveur tiers.
