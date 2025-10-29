import mongoose, { Schema, Document } from 'mongoose';
import { ExtractedReceiptData as IExtractedReceiptData, ReceiptType, ReceiptItem, ExtractedField } from '../types';

export interface ExtractedReceiptDataDocument extends IExtractedReceiptData, Document {
  _id: string;
}

const BoundingBoxSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
}, { _id: false });

const ExtractedFieldSchema = new Schema({
  value: { type: Schema.Types.Mixed, required: true },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  rawText: { type: String },
  boundingBox: { type: BoundingBoxSchema },
}, { _id: false });

const AmountFieldSchema = new Schema({
  value: {
    type: Number,
    required: true,
    min: 0,
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  rawText: { type: String },
  boundingBox: { type: BoundingBoxSchema },
}, { _id: false });

const ReceiptItemSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    min: 0,
  },
  unitPrice: {
    type: Number,
    min: 0,
  },
  totalPrice: {
    type: Number,
    min: 0,
  },
  category: {
    type: String,
    trim: true,
  },
}, { _id: false });

const ProcessingMetadataSchema = new Schema({
  processingTime: {
    type: Number,
    required: true,
    min: 0,
  },
  ocrConfidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  aiConfidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  imagePreprocessed: {
    type: Boolean,
    required: true,
    default: false,
  },
  detectedLanguage: {
    type: String,
    trim: true,
  },
}, { _id: false });

const ExtractedFieldsSchema = new Schema({
  totalAmount: {
    type: AmountFieldSchema,
    required: true,
  },
  date: {
    type: ExtractedFieldSchema,
    required: true,
  },
  merchantName: {
    type: ExtractedFieldSchema,
    required: true,
  },
  items: {
    type: [ReceiptItemSchema],
    default: [],
  },
  summary: {
    type: String,
    required: true,
    trim: true,
  },
  taxAmount: {
    type: ExtractedFieldSchema,
  },
  subtotal: {
    type: ExtractedFieldSchema,
  },
  paymentMethod: {
    type: ExtractedFieldSchema,
  },
  receiptNumber: {
    type: ExtractedFieldSchema,
  },
}, { _id: false });

const ExtractedReceiptDataSchema = new Schema<ExtractedReceiptDataDocument>({
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  receiptType: {
    type: String,
    enum: Object.values(ReceiptType),
    required: true,
    index: true,
  },
  extractedFields: {
    type: ExtractedFieldsSchema,
    required: true,
  },
  processingMetadata: {
    type: ProcessingMetadataSchema,
    required: true,
  },
  extractedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'extracted_receipt_data',
});

// Indexes for performance and search
ExtractedReceiptDataSchema.index({ receiptType: 1, extractedAt: -1 });
ExtractedReceiptDataSchema.index({ 'extractedFields.merchantName.value': 'text' });
ExtractedReceiptDataSchema.index({ 'extractedFields.totalAmount.value': 1 });
ExtractedReceiptDataSchema.index({ 'extractedFields.date.value': 1 });
ExtractedReceiptDataSchema.index({ 'processingMetadata.processingTime': 1 });

// Compound indexes for common queries
ExtractedReceiptDataSchema.index({ 
  receiptType: 1, 
  'extractedFields.totalAmount.value': 1, 
  extractedAt: -1 
});

// Virtual for converting _id to id
ExtractedReceiptDataSchema.virtual('id').get(function(this: any) {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized
ExtractedReceiptDataSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc: any, ret: any) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ExtractedReceiptDataModel = mongoose.model<ExtractedReceiptDataDocument>(
  'ExtractedReceiptData',
  ExtractedReceiptDataSchema
);