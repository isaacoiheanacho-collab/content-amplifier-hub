"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitBoost = void 0;
const db_1 = require("../models/db"); // Using your corrected central connection
const submitBoost = (memberId, contentUrl, platform) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. Check if member has reached their 20-link monthly limit
    const memberCheck = yield db_1.db.query('SELECT monthly_boosts_used, membership_active FROM members WHERE id = $1', [memberId]);
    const member = memberCheck.rows[0];
    if (!member.membership_active) {
        return { success: false, message: "Account inactive. Please pay maintenance fee." };
    }
    if (member.monthly_boosts_used >= 20) {
        return { success: false, message: "Monthly limit of 20 links reached." };
    }
    // 2. Find the next available hourly slot (max 500 links per hour)
    // We look for the first hour from 'now' that has fewer than 500 entries
    const slotCheck = yield db_1.db.query(`
        SELECT hour_slot FROM (
            SELECT generate_series(
                date_trunc('hour', now()), 
                date_trunc('hour', now()) + interval '24 hours', 
                interval '1 hour'
            ) AS hour_slot
        ) AS slots
        LEFT JOIN boosts ON boosts.hour_slot = slots.hour_slot
        GROUP BY slots.hour_slot
        HAVING count(boosts.id) < 500
        ORDER BY slots.hour_slot LIMIT 1
    `);
    const availableSlot = slotCheck.rows[0].hour_slot;
    // 3. Insert the boost and increment the member's counter
    yield db_1.db.query('BEGIN'); // Start transaction for safety
    try {
        yield db_1.db.query('INSERT INTO boosts (member_id, content_url, platform, hour_slot) VALUES ($1, $2, $3, $4)', [memberId, contentUrl, platform, availableSlot]);
        yield db_1.db.query('UPDATE members SET monthly_boosts_used = monthly_boosts_used + 1 WHERE id = $1', [memberId]);
        yield db_1.db.query('COMMIT');
        return { success: true, slot: availableSlot };
    }
    catch (error) {
        yield db_1.db.query('ROLLBACK');
        throw error;
    }
});
exports.submitBoost = submitBoost;
