export const checkAccess = async (memberId: number) => {
    const res = await db.query(
        'SELECT membership_active, next_maintenance_due FROM members WHERE id = $1',
        [memberId]
    );
    
    const member = res.rows[0];
    const now = new Date();

    // If they haven't paid their monthly 500 Naira, they can't submit links
    if (!member.membership_active || (member.next_maintenance_due && now > member.next_maintenance_due)) {
        return { allowed: false, reason: "Maintenance fee required" };
    }

    return { allowed: true };
};