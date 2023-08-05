# Melodic Analysis
Bash script that runs melodic analysis over subjects, splits the results into 20 components, applies dual regression to each component, renames files, subtracts session B from session A to get difference map, merges difference maps and run T-tests on the 4D image.

### Scripts
melodic.sh: the main script  
cleanup.sh: removes all previous outputs from melodic.sh

### Usage
-i: Directory containing all subjects  
-s: Path to session data CSV  
Example:  
To submit a job on Hoffman2: `qsub melodic.sh -i /u/project/petersen/data/ocs/bids/derivatives/FSLpipeline -s OCs_sessions.csv`  
To run on current node: `./melodic.sh -i /u/project/petersen/data/ocs/bids/derivatives/FSLpipeline -s OCs_sessions.csv`

### Outputs
- Melodic_Outputs: directory that contains outputs from melodic
- Volumes: directory that contains the 20 components (vol0000.nii.gz - vol0019.nii.gz) from fslsplit
- Volumes/dr_vol0000-0019: directory that contains the 20 components with dual regression applied and names fixed (Session_SubID_dr_stage2.nii.gz), difference maps (SubID_difference_map.nii.gz), merged difference map (merged_difference_map.nii.gz), and T-test outputs (t-test_output...)
- sublist.txt: all the subjects involved, this may not be all the subjects in the input directory
- Volumes_backup.tar.gz: the Volumes directory after dual regression but before renaming and getting difference maps
