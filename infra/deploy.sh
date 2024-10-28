#!/bin/sh
ssh -i "music-graph2.pem" ec2-user@ec2-18-199-122-244.eu-central-1.compute.amazonaws.com << EOF
  cd /home/ec2-user/music-graph2
  git pull
  deno i
  deno task build
  # Copy service file
  sudo cp ./infra/music-graph2.service /etc/systemd/system/music-graph2.service
  # Restart service
  sudo systemctl stop music-graph2.service
  sudo systemctl start music-graph2.service
EOF
