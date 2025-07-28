# Logiciels requis

- [Node.js](https://nodejs.org/fr/download)
- [Git](https://git-scm.com/downloads)

# Configuration du site

1. Ouvrir un terminal

2. Cloner le site :

```bash
git clone https://github.com/Nathan94600/Projet-web.git
```

3. Aller dans le dossier du site

4. Installer les paquets nécesessaires :

```bash
npm i
```

5. Créer un fichier `config.json` comme suit :
```json
{
  "email": "VOTRE EMAIL OUTLOOK",
  "password": "VOTRE MOT DE PASSE OUTLOOK",
	"certPath": "CHEMIN VERS LE FICHIER DU CERTIFICAT" OU null POUR LANCER LE SERVEUR EN HTTP,
	"keyPath": "CHEMIN VERS LE FICHIER DE LA CLÉ PRIVÉE" OU null POUR LANCER LE SERVEUR EN HTTP
}
```

# Lancement et accès au site

1. Lancer le server web :

Par défaut, le serveur se lance sur l'adresse locale. Pour le lancer sur une IP d'interface spécifique, utilisez l'option --ip

```bash
node server           # Lance le serveur sur l'adresse locale
```

ou pour le lancer sur une ip

```bash
node server --ip      # Lance le serveur en détectant l'IP de l'interface
```

2. Aller sur le lien affiché dans le terminal

# Todolist

- Réorganiser les fichiers `.js` utilisé pour le backend
