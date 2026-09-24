# 0013 — Sauvegardes chiffrées dans le seau S3 du client

Date : 2026-09-24 · Statut : acceptée

L'agent sauvegarde la configuration, les secrets, les bases, les projets et les sessions du compte `dev` dans un seau S3 que le client possède — Cloudflare R2, AWS S3 ou tout service compatible. Chaque partie est chiffrée sur le serveur pour une clé publique X25519 dérivée d'une phrase de passe que seul le client connaît : l'app la dérive au moment où il la tape, puis l'oublie, et ne garde que la clé publique et le sel. La plateforme ne garde de chaque sauvegarde que l'adresse, l'empreinte du manifeste et des comptes, jamais un nom ni un contenu. Une sauvegarde se restaure sur un serveur neuf pendant l'onboarding, ou sur un serveur existant qu'on remet dans cet état.

Pourquoi : le serveur du client reste la source de vérité et le client garde tout, y compris ses sauvegardes, sans que Pupitre stocke un octet de son contenu ni puisse le lire. Le coût du stockage est chez le client, celui de la plateforme est une ligne par sauvegarde. Une phrase qu'on ne garde nulle part ne peut fuir de nulle part ; son prix est qu'une phrase perdue rend les sauvegardes illisibles, et l'app le dit.

Le seau et ses clés sont ceux du client, qu'il renseigne lui-même dans l'app : Pupitre ne tient aucun seau de sauvegardes, ni pour ses clients ni pour ses propres essais, et aucune clé d'un seau ne passe par la plateforme ou par les secrets du projet. Stocker les sauvegardes chez Pupitre coûterait trop cher pour un serveur que le client apporte ; ce sera l'affaire de l'offre Hébergé, qui fournira le serveur et pourra fournir le seau avec lui.

Écarté : chiffrer avec une clé que l'app garderait au trousseau (une sauvegarde doit s'ouvrir depuis un ordinateur neuf) ; un dépôt dédupliqué par blocs à la restic (bien plus complexe, et la copie côté seau d'une partie inchangée rend déjà nul l'envoi d'un projet que personne n'a touché) ; une remise à zéro de la machine par l'agent (réinstaller l'image chez l'hébergeur est plus sûr).

Contrat : [backups.md](../contracts/backups.md).
