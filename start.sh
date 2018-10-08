#! /bin/sh
## auto-start script
cd ~/EarthCoin-API/

sleep 120
./api.sh &

sleep 10
./sync.sh &
