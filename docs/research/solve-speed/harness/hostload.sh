#!/bin/sh
# The host's load average and memory every 10 s, as `epoch-ms load1 load5 load15 swap-used`, until killed.
# usage: hostload.sh <out>
while :; do
  printf '%s %s %s\n' "$(($(date +%s) * 1000))" "$(sysctl -n vm.loadavg | tr -d '{}' | xargs)" "$(sysctl -n vm.swapusage | awk '{print $6}')" >> "$1"
  sleep 10
done
