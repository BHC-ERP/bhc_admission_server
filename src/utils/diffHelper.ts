export const getChangedData = (oldObj: any, newObj: any) => {
    const oldDiff: any = Array.isArray(newObj) ? [] : {};
    const newDiff: any = Array.isArray(newObj) ? [] : {};
    let hasChanges = false;

    for (const key in newObj) {
        let oldValue = oldObj?.[key];
        let newValue = newObj[key];

        if (oldValue instanceof Date) oldValue = oldValue.toISOString();
        if (newValue instanceof Date) newValue = newValue.toISOString();

        if (newValue && typeof newValue === 'object') {
            const sub = getChangedData(oldValue || (Array.isArray(newValue) ? [] : {}), newValue);
            if (sub.hasChanges) {
                oldDiff[key] = sub.oldDiff;
                newDiff[key] = sub.newDiff;
                hasChanges = true;
            }
        } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            const oldStr = oldValue === null || oldValue === undefined ? "" : oldValue.toString();
            const newStr = newValue === null || newValue === undefined ? "" : newValue.toString();

            if (oldStr !== newStr) {
                oldDiff[key] = oldValue;
                newDiff[key] = newValue;
                hasChanges = true;
            }
        }
    }

    return { oldDiff, newDiff, hasChanges };
};
