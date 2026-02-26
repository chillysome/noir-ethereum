
 #!/bin/bash
 
 packages=("verify_account" "verify_storage" "verify_header" "verify_transaction" "verify_receipt" "af" "svf" "rvf" "stf" "zkcross_compliance")
 
 TIME_FORMAT='
 Elapsed Time: %E
 User Time: %U
 System Time: %S
 CPU Usage: %P
 Max Memory: %M'

 format_time() {
  local input="$1"

  # Return N/A for empty input
  if [ -z "$input" ]; then
    echo "N/A"
    return 1
  fi

  # Check for valid time format (MM:SS or HH:MM:SS)
  if ! [[ "$input" =~ ^[0-9]+:[0-9]+(\.[0-9]+)?$ ]] && ! [[ "$input" =~ ^[0-9]+:[0-9]+:[0-9]+(\.[0-9]+)?$ ]]; then
    echo "N/A"
    return 1
  fi

  local hours=0 minutes=0 seconds=0 milliseconds=0

  # Split input into components
  IFS=':' read -r -a parts <<< "$input"

  if [ "${#parts[@]}" -eq 3 ]; then
    hours="${parts[0]}"
    minutes="${parts[1]}"
    seconds="${parts[2]}"
  elif [ "${#parts[@]}" -eq 2 ]; then
    minutes="${parts[0]}"
    seconds="${parts[1]}"
  else
    echo "Invalid time format"
    return 1
  fi

  # Separate seconds and milliseconds
  if [[ "$seconds" == *.* ]]; then
    milliseconds=$(printf "%.0f" "$(echo "0.${seconds#*.} * 1000" | bc 2>/dev/null)")
    seconds="${seconds%%.*}"
  fi

  # Convert to decimal (base 10) to avoid octal interpretation with leading zeros
  hours=$((10#$hours))
  minutes=$((10#$minutes))
  seconds=$((10#$seconds))
  milliseconds=$((10#$milliseconds))

  # Build output string
  output=""
  [ "$hours" -ne 0 ] && output+="${hours}h "
  [ "$minutes" -ne 0 ] && output+="${minutes}m "
  [ "$seconds" -ne 0 ] && output+="${seconds}s "
  [ "$milliseconds" -ne 0 ] && output+="${milliseconds}ms"

  # Trim trailing space
  echo "${output%" "}"
}

 
 convert_memory() {
     local kilobytes=$1

     # Return N/A for empty or invalid input
     if [ -z "$kilobytes" ] || ! [[ "$kilobytes" =~ ^[0-9]+$ ]]; then
         echo "N/A"
         return 1
     fi

     local megabytes=$(echo "scale=2; $kilobytes / 1024" | bc 2>/dev/null)
     if (( $(echo "$megabytes < 1024" | bc -l) )); then
         echo "${megabytes}MB"
     else
         local gigabytes=$(echo "scale=2; $megabytes / 1024" | bc 2>/dev/null)
         echo "${gigabytes}GB"
     fi
 }
 
 profile_command() {
     local package=$1
     local tool=$2
     local action=$3
     local command=$4

     # Use /usr/bin/time for GNU time with format support
     local time_cmd="/usr/bin/time"
     if ! command -v "$time_cmd" &> /dev/null; then
         echo "Error: GNU time not found. Please install: sudo apt-get install time"
         return 1
     fi

     temp_file=$(mktemp)
     $time_cmd -f "$TIME_FORMAT" bash -c "$command" > "$temp_file" 2>&1
     output=$(<"$temp_file")

     elapsed_time=$(format_time "$(echo "$output" | grep "Elapsed Time" | awk '{print $3}')")
     user_time=$(echo "$output" | grep "User Time" | awk '{print $3 " " $4}')
     system_time=$(echo "$output" | grep "System Time" | awk '{print $3 " " $4}')
     cpu_usage=$(echo "$output" | grep "CPU Usage" | awk '{print $3}')
     max_memory_kb=$(echo "$output" | grep "Max Memory" | awk '{print $3}')

     # Handle empty values
     [ -z "$elapsed_time" ] && elapsed_time="N/A"
     [ -z "$user_time" ] && user_time="N/A"
     [ -z "$system_time" ] && system_time="N/A"
     [ -z "$cpu_usage" ] && cpu_usage="N/A"

     # Handle empty or invalid memory values
     if [ -z "$max_memory_kb" ] || ! [[ "$max_memory_kb" =~ ^[0-9]+$ ]]; then
         max_memory="N/A"
     else
         max_memory=$(convert_memory "$max_memory_kb")
     fi

     echo "$package|$tool|$action|$elapsed_time|$user_time|$system_time|$cpu_usage|$max_memory"

     rm "$temp_file"
 }
 
 {
   echo "Package | Tool | Action | Elapsed Time | User Time (sec) | System Time (sec) | CPU Usage | Max Memory"
   echo "--------|------|--------|--------------|-----------------|-------------------|-----------|-----------"
   
   for package in "${packages[@]}"; do
       profile_command "$package" "nargo" "compile" "nargo compile --package=${package} --silence-warnings --force --enable-brillig-constraints-check --bounded-codegen"
       profile_command "$package" "nargo" "execute" "nargo execute --package=${package} --silence-warnings"
        # Create Proof Directory
        mkdir -p ./target/${package} && touch ./target/${package}/proof && touch ./target/${package}/vk
       profile_command "$package" "bb" "prove" "bb prove -b ./target/${package}.json -w ./target/${package}.gz -o ./target/${package}"
       profile_command "$package" "bb" "vk" "bb write_vk -b ./target/${package}.json -o ./target/${package}"
       profile_command "$package" "bb" "verify" "bb verify -p ./target/${package}/proof -k ./target/${package}/vk"
   done
 } | column -t -s '|'