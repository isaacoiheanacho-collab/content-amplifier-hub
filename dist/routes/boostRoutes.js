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
const express_1 = require("express");
const boostService_1 = require("../services/boostService");
const router = (0, express_1.Router)();
// This is the endpoint members will call to submit a link
router.post('/submit', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { memberId, contentUrl, platform } = req.body;
    try {
        const result = yield (0, boostService_1.submitBoost)(memberId, contentUrl, platform);
        if (result.success) {
            res.status(200).json(result);
        }
        else {
            res.status(400).json({ error: result.message });
        }
    }
    catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
}));
exports.default = router;
