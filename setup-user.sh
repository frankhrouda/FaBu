#!/bin/bash

# Skript zum Einrichten eines neuen Users und SSH-Keys auf einem Ubuntu/Debian-Server
# Führe dies als root aus: wget https://raw.githubusercontent.com/frankhrouda/FaBu/main/setup-user.sh && chmod +x setup-user.sh && ./setup-user.sh

set -e

echo "=== Einrichtung eines neuen Users und SSH-Keys ==="

# Variablen (anpassen!)
NEW_USER="deploy"
SSH_KEY_PATH="$HOME/.ssh/id_rsa_fabu"

# 1. User erstellen
echo "Erstelle User $NEW_USER..."
useradd -m -s /bin/bash $NEW_USER
passwd $NEW_USER  # Passwort setzen (du wirst danach gefragt)

# 2. Sudo-Rechte geben
echo "Gebe sudo-Rechte..."
usermod -aG sudo $NEW_USER

# 3. SSH-Verzeichnis für User erstellen
echo "Erstelle SSH-Verzeichnis..."
mkdir -p /home/$NEW_USER/.ssh
chmod 700 /home/$NEW_USER/.ssh
chown $NEW_USER:$NEW_USER /home/$NEW_USER/.ssh

# 4. SSH-Key generieren (auf deinem lokalen Rechner!)
echo "=== WICHTIG: Auf deinem lokalen Rechner ausführen ==="
echo "ssh-keygen -t rsa -b 4096 -f $SSH_KEY_PATH -C 'fabu-deploy'"
echo "Dann den Public-Key ($SSH_KEY_PATH.pub) in /home/$NEW_USER/.ssh/authorized_keys einfügen:"
echo "scp $SSH_KEY_PATH.pub root@SERVER_IP:/tmp/"
echo "cat /tmp/id_rsa_fabu.pub >> /home/$NEW_USER/.ssh/authorized_keys"
echo "chmod 600 /home/$NEW_USER/.ssh/authorized_keys"
echo "chown $NEW_USER:$NEW_USER /home/$NEW_USER/.ssh/authorized_keys"

# 5. SSH-Konfiguration anpassen
echo "Passe SSH-Konfiguration an..."
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# 6. SSH neu starten
echo "Starte SSH-Dienst neu..."
systemctl restart ssh

# 7. Firewall einrichten
echo "Richte UFW ein..."
ufw allow OpenSSH
ufw --force enable

echo "=== Fertig! ==="
echo "Ab jetzt mit: ssh -i $SSH_KEY_PATH $NEW_USER@SERVER_IP"
echo "Root-Login ist deaktiviert. Teste den neuen User!"