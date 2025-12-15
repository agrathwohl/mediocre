#!/bin/bash

# Script to process 10 random ABC files with associated WAV files
# Runs generate-ascii-art and generate-choreography for each

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎵 Finding ABC files with associated WAV files...${NC}"

# Find all ABC files that have a corresponding WAV file
abc_files=()
for abc_file in output/*.abc; do
    [ -e "$abc_file" ] || continue

    # The WAV file pattern is ABC_NAME + "1.mid.wav"
    basename="${abc_file%.abc}"
    wav_file="${basename}1.mid.wav"

    if [ -f "$wav_file" ]; then
        abc_files+=("$abc_file")
    fi
done

echo -e "${GREEN}✓ Found ${#abc_files[@]} ABC files with WAV files${NC}"

# Check if we have any files
if [ ${#abc_files[@]} -eq 0 ]; then
    echo -e "${RED}❌ No ABC files with associated WAV files found${NC}"
    exit 1
fi

# Randomly select up to 10 files
num_files=${#abc_files[@]}
if [ $num_files -gt 10 ]; then
    num_to_process=10
else
    num_to_process=$num_files
fi

echo -e "${BLUE}🎲 Randomly selecting ${num_to_process} files to process...${NC}\n"

# Shuffle and take first N
IFS=$'\n' shuffled=($(printf '%s\n' "${abc_files[@]}" | shuf | head -n $num_to_process))
unset IFS

# Process each file
success_count=0
fail_count=0
for i in "${!shuffled[@]}"; do
    abc_file="${shuffled[$i]}"
    basename="${abc_file%.abc}"
    filename=$(basename "$abc_file")
    wav_file="${basename}1.mid.wav"

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}[$((i+1))/${num_to_process}] Processing: ${filename}${NC}"
    echo -e "${BLUE}   WAV: $(basename "$wav_file")${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Check for description file
    md_file="${basename}.md"
    if [ ! -f "$md_file" ]; then
        echo -e "${YELLOW}⚠️  No description file, creating one...${NC}"
        # Extract title from ABC
        title=$(grep "^T:" "$abc_file" | head -1 | cut -d: -f2- | sed 's/^ *//;s/ *$//')
        [ -z "$title" ] && title="Untitled"
        echo "# $title" > "$md_file"
        echo "" >> "$md_file"
        echo "Auto-generated for $(basename "$abc_file")" >> "$md_file"
    fi

    # Run generate-ascii-art
    echo -e "\n${YELLOW}🎨 Generating ASCII art...${NC}"
if node src/index.js generate-ascii-art -a "$abc_file" -d "$md_file" -c 12 2>&1 | tail -5; then
    echo -e "${GREEN}✓ ASCII art generated${NC}"
    else
        echo -e "${RED}✗ ASCII art generation failed${NC}"
        ((fail_count++))
    fi

    # Run generate-choreography
    echo -e "\n${YELLOW}🎭 Generating choreography...${NC}"
    if node src/index.js generate-choreography -a "$abc_file" -df "$md_file" --schema-version 1.0 --chunked 2>&1 | tail -10; then
        echo -e "${GREEN}✓ Choreography generated${NC}"
    else
        echo -e "${RED}✗ Choreography generation failed${NC}"
        ((fail_count++))
    fi

    echo ""
done

echo -e "${BLUE}📊 Processing Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Successfully processed: ${success_count}/${num_to_process} files${NC}"

if [ $fail_count -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some operations had failures${NC}"
fi

echo -e "\n${BLUE}📁 Generated files:${NC}"
echo "  • ASCII art: output/*.ascii-art.json"
echo "  • Choreography: output/*.choreography.json"
echo ""

echo -e "${GREEN}✨ Done!${NC}"
