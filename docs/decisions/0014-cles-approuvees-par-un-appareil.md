# 0014 — Un accès au serveur n'est accordé que par un appareil déjà autorisé

Date : 2026-09-24 · Statut : acceptée

La plateforme ne peut plus ouvrir un serveur. Elle transmet les clés publiques des appareils, mais l'agent n'en pose une dans le bloc `authorized_keys` géré que si elle arrive avec une approbation signée par une clé qu'il tient déjà pour sûre. Retirer une clé reste possible sans signature : c'est le sens qui ferme l'accès, jamais celui qui l'ouvre.

- **La racine de confiance est posée par SSH, pas par la plateforme.** À l'onboarding, l'app installe elle-même la clé de l'appareil sur le serveur. L'agent la note comme signataire dans un fichier de `/etc/pupitre`, root, 0600. Une clé ne devient signataire que posée ainsi, ou acceptée par une approbation valide.
- **Une approbation est une signature SSHSIG** (`ssh-keygen -Y sign`, espace de noms propre à Pupitre) faite par la clé privée d'un appareil autorisé, qui ne quitte jamais son ordinateur. Elle couvre l'identifiant du serveur, la clé publique approuvée, l'utilisateur et la date. L'agent vérifie la signature, le serveur et la clé ; sinon il ignore l'entrée et la signale comme en attente.
- **Le geste pour le client.** Un nouvel appareil, le sien ou celui d'un membre à qui l'on attribue le serveur, apparaît dans l'app de tout appareil déjà autorisé : « Autoriser <appareil> de <personne> sur <serveur> ». Un clic signe. Le client seul avec un seul ordinateur ne voit rien de nouveau.
- **Garde-fous.** L'agent ne retire jamais la dernière clé du bloc. Ajouter un appareil au compte demande de repasser la passkey ou le second facteur et envoie un email. Réparer un serveur est réservé à la personne attribuée ou à un admin, et ne réécrit ni le compte SSH ni l'empreinte d'hôte.
- **Secours.** Tous les appareils perdus : depuis la console de l'hébergeur, `sudo pupitred keys reset` repose une clé fournie localement, et l'onboarding la reprend.
- **Le reste de ce que la plateforme pousse est borné par l'agent :**
  - le droit d'usage ne fait que restreindre ;
  - la version cible est un binaire signé Ed25519, au-dessus d'un plancher ;
  - une restauration exige l'empreinte du manifeste ;
  - l'identifiant du serveur est un UUID ;
  - les options de clé sont refusées.

Pourquoi : une plateforme compromise, une session admin volée ou une XSS de la console ne donnent plus root sur les serveurs des clients. Le pire qu'elles puissent faire est couper un accès, ce qui se répare depuis l'hébergeur. La règle « aucune clé privée hors du laptop du client » devient aussi « aucun accès sans un laptop du client ».

Écarté :
- **Assumer le pouvoir de la plateforme et l'écrire dans les conditions** : c'était la faille à fermer.
- **Une clé racine propre au client, distincte des clés d'appareil** : une clé de plus à perdre, pour le même résultat.
- **Faire poser chaque clé par l'app en SSH direct** : impossible quand l'appareil qui autorise est hors ligne ; la signature relayée fonctionne en différé.
