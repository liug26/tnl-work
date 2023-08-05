#!/usr/bin/env bash

# Hoffman job configurations
#$ -cwd
#$ -pe shared 4
#$ -l h_rt=24:00:00,h_data=12G,h_vmem=24G,highp

DATE_FORMAT="+%Y/%m/%d %H:%M:%S"
echo "Script starts at `date "$DATE_FORMAT"`"
echo "Loading FSL..."
. /u/local/Modules/default/init/modules.sh
module use /u/project/CCN/apps/modulefiles
module load fsl
export NO_FSL_JOBS=true


# Parsing arguments
print_usage()
{
    echo "Usage:"
    echo "-i: Directory containing all subjects"
    echo "-s: Path to session data CSV"
    exit 1
}

SUB_DIR=""
SESSION_CSV=""
while getopts "i:s:" flag; do
    case "${flag}" in
        i) SUB_DIR="${OPTARG}" ;;
        s) SESSION_CSV="${OPTARG}" ;;
        *) print_usage
        exit 1 ;;
    esac
done
echo "Subject directory: $SUB_DIR"
echo "Session data: $SESSION_CSV"
# check arguments
if [ ! -d "$SUB_DIR" ]; then
    echo "$SUB_DIR does not exist! Ending script"
    exit 1
fi
if [ ! -f "$SESSION_CSV" ]; then
    echo "$SESSION_CSV does not exist! Ending script"
    exit 1
fi


# Step 1: Create and validate a list of subjects
SUBLIST_FILE="sublist.txt"
echo "Looking for subjects in $SUB_DIR"
SUBLIST=()
DRFDAN_LIST=()
declare -i NUM_SUBS=0
declare -i NUM_VALID_SUBS=0
> "$SUBLIST_FILE"
for SUB in "$SUB_DIR"/sub-*/; do
    # each subject has to be a directory
    [ -d $SUB ] || continue
    # add path of sub*-denoised_realign...nii.gz to txt file
    if ! compgen -G "$SUB"Preproc.feat/sub-*_denoised_realign_func_data_nonaggr.nii.gz > /dev/null; then
        echo "Warning: $SUB does not have denoised_realign_func_data_nonaggr.nii.gz under Preproc.feat, skipping"
    else
        SUB_NAME=$(basename $SUB)
        SUBLIST+=($SUB_NAME)
        DRFDAN_LIST+=("$SUB"Preproc.feat/sub-*_denoised_realign_func_data_nonaggr.nii.gz)
        echo "$SUB_NAME" >> $SUBLIST_FILE
        NUM_VALID_SUBS+=1
    fi
    NUM_SUBS+=1
done
echo "${NUM_VALID_SUBS}/${NUM_SUBS} subjects are added to $SUBLIST_FILE"


# Step 2: Running melodic on subject data
MELODIC_OUTPUT_NAME="Melodic_Outputs"
MELODIC_DEBUG_NAME="debug_information.txt"
mkdir $MELODIC_OUTPUT_NAME
echo "Starting melodic at `date "$DATE_FORMAT"`"
melodic -i $DRFDAN_LIST -o "$MELODIC_OUTPUT_NAME" --tr=0.8 --nobet -a concat --report --Oall -d 20 -v --debug &> "$MELODIC_OUTPUT_NAME/$MELODIC_DEBUG_NAME"
echo "melodic finished at `date "$DATE_FORMAT"`!"
echo "melodic outputs: $MELODIC_OUTPUT_NAME"


# Step 3: Split melodic_IC.nii.gz into its 20 separate components
echo "Splitting melodic results"
VOLS_DIR="Volumes"
mkdir $VOLS_DIR
cd $VOLS_DIR
fslsplit ../$MELODIC_OUTPUT_NAME/melodic_IC.nii.gz


# Step 4: Apply dual regression on each component/volume
# iterate over vol0000... vol0019.nii.gz
echo "Applying dual regression, starting at `date "$DATE_FORMAT"`"
for VOL_ID in $(seq -f "%04g" 0 19); do 
    echo "dual regression on vol${VOL_ID}.nii.gz"
    dual_regression "vol${VOL_ID}.nii.gz" 1 -1 0 "dr_vol${VOL_ID}" `IFS=$'\n'; echo "${DRFDAN_LIST[*]}"` &
done
wait
echo "Dual regression finished at `date "$DATE_FORMAT"`"


# Step 5: Fix image names to reflect subject ID & session
# backup because the following may cause a big disturbance
echo "Backing up $VOLS_DIR"
cd ..
tar -czf "${VOLS_DIR}_backup.tar.gz" $VOLS_DIR

# Part a: remove 'subject00000' and put subject ID into file names
# iterate over dr_vol0000... dr_vol0019
echo "Attaching subject ID to file names..."
for VOL_ID in $(seq -f "%04g" 0 19); do 
    # iterate over all subjects
    for SUB_ID_INDEX in "${!SUBLIST[@]}"; do 
        # the 5-digit number after dr_stage_2_subject...nii.gz
        FORMATTED_INDEX=$(printf "%05d\n" $SUB_ID_INDEX)
        # remove the 'sub-' from subject IDs
        SUB_NUM=$(echo ${SUBLIST[SUB_ID_INDEX]} | tr -d -c 0-9)
        mv "$VOLS_DIR/dr_vol${VOL_ID}/dr_stage2_subject${FORMATTED_INDEX}.nii.gz" "$VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}_dr_stage2.nii.gz" &
        mv "$VOLS_DIR/dr_vol${VOL_ID}/dr_stage2_subject${FORMATTED_INDEX}_Z.nii.gz" "$VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}_dr_stage2_Z.nii.gz" &
    done
done
wait

# Part b: Add seesion A/B into file names
# iterate over each line in session data csv file
echo "Attaching session A/B to file names"
while IFS=, read -r SUB_NUM SESSION INTERVENTION col4
do
    # skip the first row, and skip if there is no useful info
    if [ "$SUB_NUM" = "Participant ID" ] || [ "$SESSION" = "Intake" ]; then
        continue
    fi
    # warn if subject's scan doesn't exists
    if [ ! -e "$VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}${SCAN_NUM}_dr_stage2.nii.gz" ]; then
        echo "Warning: cannot rename, $VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}${SCAN_NUM}_dr_stage2.nii.gz does not exist"
    fi
    if [ ! -e "$VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}${SCAN_NUM}_dr_stage2_Z.nii.gz" ]; then
        echo "Warning: cannot rename, $VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}${SCAN_NUM}_dr_stage2_Z.nii.gz does not exist"
    fi
    # for each component/volume
    for VOL_ID in $(seq -f "%04g" 0 19); do 
        SCAN_NUM=$(echo $SESSION | tr -d -c 0-9)
        ORI_NAME=$(basename ${DR_DIR}/out_vol${VOL_ID}/)
        mv "$VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}${SCAN_NUM}_dr_stage2.nii.gz" "$VOLS_DIR/dr_vol${VOL_ID}/${INTERVENTION}_${SUB_NUM}${SCAN_NUM}_dr_stage2.nii.gz" &
        mv "$VOLS_DIR/dr_vol${VOL_ID}/${SUB_NUM}${SCAN_NUM}_dr_stage2_Z.nii.gz" "$VOLS_DIR/dr_vol${VOL_ID}/${INTERVENTION}_${SUB_NUM}${SCAN_NUM}_dr_stage2_Z.nii.gz" &
    done
done < $SESSION_CSV
wait


# Step 6: Subtract session B from session A (A - B) to get difference map
echo "Subtracting session B from session A..."
PREV_SUB_NUM=""
# iterate over each line in session data csv file
while IFS=, read -r SUB_NUM SESSION INTERVENTION col4
do
    # skip the first row, and don't process rows whose subject ID is a repeat
    if [ "$SUB_NUM" = "Participant ID" ] || [ "$PREV_SUB_NUM" = "$SUB_NUM" ]; then
        continue
    fi
    # for each component/volume, 
    for VOL_ID in $(seq -f "%04g" 0 19); do
        # find A&B images
        A_IMAGE_NAME=$(basename $VOLS_DIR/dr_vol$VOL_ID/A_${SUB_NUM}*_dr_stage2.nii.gz)
        B_IMAGE_NAME=$(basename $VOLS_DIR/dr_vol$VOL_ID/B_${SUB_NUM}*_dr_stage2.nii.gz)
        # check if A&B images exist
        if [[ $A_IMAGE_NAME == *"*"* ]] || [[ $B_IMAGE_NAME == *"*"* ]]; then
            echo "Warning: Session A or B does not exist for sub-${SUB_NUM}!"
            echo "A: ${A_IMAGE_NAME}, B: ${B_IMAGE_NAME}"
        else
            fslmaths "$VOLS_DIR/dr_vol$VOL_ID/$A_IMAGE_NAME" -sub "$VOLS_DIR/dr_vol$VOL_ID/$B_IMAGE_NAME" "$VOLS_DIR/dr_vol$VOL_ID/${SUB_NUM}_difference_map" &
        fi
        # do the same on _Z images
        A_IMAGE_NAME=$(basename $VOLS_DIR/dr_vol$VOL_ID/A_${SUB_NUM}*_dr_stage2_Z.nii.gz)
        B_IMAGE_NAME=$(basename $VOLS_DIR/dr_vol$VOL_ID/B_${SUB_NUM}*_dr_stage2_Z.nii.gz)
        if [[ $A_IMAGE_NAME == *"*"* ]] || [[ $B_IMAGE_NAME == *"*"* ]]; then
            echo "Warning: Session A or B does not exist for sub-${SUB_NUM}!"
            echo "A: ${A_IMAGE_NAME}, B: ${B_IMAGE_NAME}"
        else
            fslmaths "$VOLS_DIR/dr_vol$VOL_ID/$A_IMAGE_NAME" -sub "$VOLS_DIR/dr_vol$VOL_ID/$B_IMAGE_NAME" "$VOLS_DIR/dr_vol$VOL_ID/${SUB_NUM}_difference_map_Z" &
        fi
    done
    PREV_SUB_NUM=$SUB_NUM
done < $SESSION_CSV
wait


# Step 7: merge all difference maps into a 4D image and run a 1-sample t-test
# Part a: merge difference maps for each component
# iterate over dr_vol0000... dr_vol0019
echo "Merging difference maps"
MERGED_OUTPUT_NAME="merged_difference_map"
MERGED_SUBLIST_NAME="merged_difference_map_sublist.txt"
for VOL_ID in $(seq -f "%04g" 0 19); do
    # find all difference maps
    ALL_DIFF_MAPS=""
    > "$VOLS_DIR/dr_vol$VOL_ID/$MERGED_SUBLIST_NAME"
    for DIFF_MAP in $VOLS_DIR/dr_vol$VOL_ID/*_difference_map.nii.gz; do
        ALL_DIFF_MAPS="$ALL_DIFF_MAPS $DIFF_MAP"
        echo `basename $DIFF_MAP` >> "$VOLS_DIR/dr_vol$VOL_ID/$MERGED_SUBLIST_NAME"
    done
    # merge difference maps
    fslmerge -t "$VOLS_DIR/dr_vol$VOL_ID/$MERGED_OUTPUT_NAME" $ALL_DIFF_MAPS &
done
wait

# Part b: run t-test on each merged 4D image
# iterate over dr_vol0000... dr_vol0019
echo "Starting T-tests at `date "$DATE_FORMAT"`"
TTEST_OUTPUT_NAME="t-test_output"
for VOL_ID in $(seq -f "%04g" 0 19); do
    randomise -i "$VOLS_DIR/dr_vol$VOL_ID/$MERGED_OUTPUT_NAME" -o "$VOLS_DIR/dr_vol$VOL_ID/$TTEST_OUTPUT_NAME" -1 -T &
done
wait
echo "T-tests finished at `date "$DATE_FORMAT"`"


echo "Script ends at `date "$DATE_FORMAT"`"
