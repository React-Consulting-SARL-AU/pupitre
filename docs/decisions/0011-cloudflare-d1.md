# 0011 — Cloudflare D1 plutôt que Neon : toute la plateforme chez Cloudflare

Date : 2026-09-12 · Statut : acceptée · Remplace la base de [0004](./0004-elysia-better-auth-prisma-neon.md)

Les données de la plateforme sont dans **Cloudflare D1**, une base SQLite par environnement, liée au Worker de la console. Prisma 7 reste, sur l'adaptateur D1 ; le schéma passe en `provider = "sqlite"` ; les migrations sont des fichiers SQL que wrangler applique. Le Worker est en *smart placement*, à côté de sa base, en Amérique du Nord (`enam`), la région de tout ce que Pupitre tient chez Cloudflare.

Pourquoi : Neon facture un compute qui dort après cinq minutes de silence et se réveille à la première requête. Un agent enrôlé lit son état toutes les trente secondes et bat toutes les cinq minutes, les tâches planifiées passaient toutes les cinq minutes : la base ne dormait jamais, pour zéro client. Déplacer ce trafic vers un Durable Object aurait ajouté une projection à tenir à jour et une classe de bugs. D1 supprime le problème à la racine — on paie des lignes lues et écrites, et le palier gratuit en donne des millions par jour — et retire un fournisseur, `neonctl`, les branches par branche Git, deux secrets et la garde du point poolé. Le schéma validait déjà en SQLite, le code n'écrivait aucune transaction interactive : la migration s'est faite avant le premier client, quand elle ne coûtait rien.

Ce qu'on accepte : dix gigaoctets par base, une seule région d'écriture, pas de transaction interactive — on ne s'en sert pas — et une comparaison de casse faite en code plutôt que dans la requête. Les sauvegardes sont le *Time Travel* de D1, trente jours.

Le jour où D1 ne suffit plus, Prisma et le scope par requête (`@pupitre/db/scope`) sont les deux seules coutures à défaire : l'adaptateur change, le code de l'API ne voit rien.
