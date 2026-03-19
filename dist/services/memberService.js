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
exports.registerNewMember = void 0;
const db_1 = require("../models/db");
const registerNewMember = (email, passwordHash) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. Check current total to see if we are still in the "Early Bird" phase (under 10k)
    const statsResult = yield db_1.db.query('SELECT total_registered_members FROM app_stats LIMIT 1');
    const totalMembers = statsResult.rows[0].total_registered_members;
    // 2. Determine the Rule: First 10,000 get the 5,000 Naira rate, then 20,000
    const isEarlyBird = totalMembers < 10000;
    const registrationFee = isEarlyBird ? 5000 : 20000;
    // 3. Create the member profile (Starts as FALSE until they pay the fee)
    const newMember = yield db_1.db.query(`INSERT INTO members (email, password_hash, is_early_bird, membership_active) 
         VALUES ($1, $2, $3, false) RETURNING id, email, is_early_bird`, [email, passwordHash, isEarlyBird]);
    // 4. Update the counter so the next person is counted correctly
    yield db_1.db.query('UPDATE app_stats SET total_registered_members = total_registered_members + 1');
    return {
        member: newMember.rows[0],
        amountToPay: registrationFee,
        maintenanceFee: 500
    };
});
exports.registerNewMember = registerNewMember;
