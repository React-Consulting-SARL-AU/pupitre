export const transfers = {
  en: {
    "transfers.panel": "Transfers",
    "transfers.panel.count.one": "{count} in progress",
    "transfers.panel.count.other": "{count} in progress",
    "transfers.panel.toggle": "Show or hide the transfers",
    "transfers.row.upload": "Sending to the server",
    "transfers.row.download": "Downloading to this computer",
    "transfers.row.label": "Transfer of {name}",
    "transfers.row.progress": "{done} of {total}",
    "transfers.row.progressUnknown": "{done} sent",
    "transfers.row.remaining": "{remaining} left",
    "transfers.row.scp":
      "Sent whole: this transfer does not resume where it stopped.",
    "transfers.row.paused": "Paused",
    "transfers.row.queued": "Waiting for a turn",
    "transfers.row.done": "Done",
    "transfers.row.failed": "Stopped",
    "transfers.row.cancelled": "Cancelled",
    "transfers.action.pause": "Pause {name}",
    "transfers.action.resume": "Resume {name}",
    "transfers.action.cancel": "Cancel {name}",
    "transfers.action.dismiss": "Remove {name} from the list",
    "transfers.upload": "Send…",
    "transfers.upload.title": "Send files or folders to this folder",
    "transfers.drop": "Drop here to send to {folder}",
    "transfers.drop.label": "Drop zone of the folder",
    "transfers.dropped.one": "{count} transfer started",
    "transfers.dropped.other": "{count} transfers started",
    "transfers.download": "Download",
    "transfers.download.title": "Save on this computer",
    "transfers.download.file": "Download the file",
    "transfers.download.folder": "Download the folder",
    "transfers.dump.download": "Download the dump",
    "transfers.dump.import": "Import a dump from my computer",
    "transfers.dump.import.help":
      "The file is sent to the server's dumps folder, then imported.",
    "transfers.dump.importing":
      "Waiting for the file to arrive before importing it",
    "refusal.transfer.remotePath": "This path is not under the server's files.",
    "refusal.transfer.remotePath.fix":
      "Pick a folder from the file browser, and try again.",
    "refusal.transfer.localPath":
      "The app only sends what you point at in a dialog or drop on the window.",
    "refusal.transfer.localPath.fix":
      "Use the Send button or drop the file on the list.",
    "refusal.transfer.localMissing": "{name} is not on this computer any more.",
    "refusal.transfer.localMissing.fix": "Point at the file again.",
    "refusal.transfer.retrying":
      "The connection dropped. Attempt {attempt} of {max} is on its way.",
    "refusal.transfer.network":
      "The connection dropped {max} times in a row: the transfer is stopped.",
    "refusal.transfer.network.fix":
      "Check the server is reachable, then resume: what arrived is kept.",
    "refusal.transfer.io": "{name} could not be written on the other side.",
    "refusal.transfer.io.fix":
      "Check the free space and the permissions of the destination folder.",
    "refusal.transfer.partial": "Part of {name} was not transferred.",
    "refusal.transfer.partial.fix":
      "A file vanished or refused to be read on the way. Resume the transfer.",
    "refusal.transfer.failed": "{tool} stopped on {name} (code {code}).",
    "refusal.transfer.failed.fix":
      "Resume the transfer. If it stops again, open a terminal on the server and check the destination folder.",
    "refusal.transfer.mismatch":
      "{name} arrived, but it does not match the original.",
    "refusal.transfer.mismatch.fix":
      "Send it again: without rsync on the server, the file goes whole and is checked at the end.",
  },
  fr: {
    "transfers.panel": "Transferts",
    "transfers.panel.count.one": "{count} en cours",
    "transfers.panel.count.other": "{count} en cours",
    "transfers.panel.toggle": "Afficher ou masquer les transferts",
    "transfers.row.upload": "Envoi vers le serveur",
    "transfers.row.download": "Téléchargement vers cet ordinateur",
    "transfers.row.label": "Transfert de {name}",
    "transfers.row.progress": "{done} sur {total}",
    "transfers.row.progressUnknown": "{done} transmis",
    "transfers.row.remaining": "{remaining} restantes",
    "transfers.row.scp":
      "Envoyé d'un bloc : ce transfert ne reprend pas là où il s'est arrêté.",
    "transfers.row.paused": "En pause",
    "transfers.row.queued": "En attente de son tour",
    "transfers.row.done": "Terminé",
    "transfers.row.failed": "Arrêté",
    "transfers.row.cancelled": "Annulé",
    "transfers.action.pause": "Mettre {name} en pause",
    "transfers.action.resume": "Reprendre {name}",
    "transfers.action.cancel": "Annuler {name}",
    "transfers.action.dismiss": "Retirer {name} de la liste",
    "transfers.upload": "Envoyer…",
    "transfers.upload.title":
      "Envoyer des fichiers ou des dossiers dans ce dossier",
    "transfers.drop": "Déposez ici pour envoyer dans {folder}",
    "transfers.drop.label": "Zone de dépôt du dossier",
    "transfers.dropped.one": "{count} transfert lancé",
    "transfers.dropped.other": "{count} transferts lancés",
    "transfers.download": "Télécharger",
    "transfers.download.title": "Enregistrer sur cet ordinateur",
    "transfers.download.file": "Télécharger le fichier",
    "transfers.download.folder": "Télécharger le dossier",
    "transfers.dump.download": "Télécharger le dump",
    "transfers.dump.import": "Importer un dump depuis mon ordinateur",
    "transfers.dump.import.help":
      "Le fichier est envoyé dans le dossier des dumps du serveur, puis importé.",
    "transfers.dump.importing":
      "En attente de l'arrivée du fichier avant de l'importer",
    "refusal.transfer.remotePath":
      "Ce chemin n'est pas sous les fichiers du serveur.",
    "refusal.transfer.remotePath.fix":
      "Choisissez un dossier dans le navigateur de fichiers, puis recommencez.",
    "refusal.transfer.localPath":
      "L'app n'envoie que ce que vous désignez dans une boîte de dialogue ou déposez sur la fenêtre.",
    "refusal.transfer.localPath.fix":
      "Utilisez le bouton Envoyer ou déposez le fichier sur la liste.",
    "refusal.transfer.localMissing": "{name} n'est plus sur cet ordinateur.",
    "refusal.transfer.localMissing.fix": "Désignez le fichier à nouveau.",
    "refusal.transfer.retrying":
      "La connexion a été coupée. L'essai {attempt} sur {max} est en route.",
    "refusal.transfer.network":
      "La connexion a été coupée {max} fois de suite : le transfert est arrêté.",
    "refusal.transfer.network.fix":
      "Vérifiez que le serveur est joignable, puis reprenez : ce qui est arrivé est gardé.",
    "refusal.transfer.io": "{name} n'a pas pu être écrit de l'autre côté.",
    "refusal.transfer.io.fix":
      "Vérifiez l'espace libre et les droits du dossier de destination.",
    "refusal.transfer.partial": "Une partie de {name} n'a pas été transférée.",
    "refusal.transfer.partial.fix":
      "Un fichier a disparu ou n'a pas pu être lu en route. Reprenez le transfert.",
    "refusal.transfer.failed": "{tool} s'est arrêté sur {name} (code {code}).",
    "refusal.transfer.failed.fix":
      "Reprenez le transfert. S'il s'arrête encore, ouvrez un terminal sur le serveur et vérifiez le dossier de destination.",
    "refusal.transfer.mismatch":
      "{name} est arrivé, mais ne correspond pas à l'original.",
    "refusal.transfer.mismatch.fix":
      "Renvoyez-le : sans rsync sur le serveur, le fichier part d'un bloc et se vérifie à la fin.",
  },
} as const;
