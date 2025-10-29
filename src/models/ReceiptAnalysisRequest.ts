import mongoose, { Schema, Document } from 'mongoose';
import { ReceiptAnalysisRequest as IReceiptAnalysisRequest, ReceiptStatus, ReceiptType, ImageFormat } from '../types';

export interface ReceiptAnalysisRequestDocument extends IReceiptAnalysisRequest, Document {
  _id: string;
}

const ImageMetadataSchema = new Schema({
  format: {
    type: String,
    enum: Object.values(ImageFormat),
    required: true,
  },
  size: {
    type: Number,
    required: true,
    min: 0,
  },
  dimensions: {
    width: {
      type: Number,
      required: true,
      min: 1,
    },
    height: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  originalName: {
    type: String,
    trim: true,
  },
  mimeType: {
    type: String,
    required: true,
    trim: true,
  },
}, { _id: false });

const RequestMetadataSchema = new Schema({
  source: {
    type: String,
    trim: true,
  },
  expectedType: {
    type: String,
    enum: Object.values(ReceiptType),
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal',
  },
}, { _id: false });

const ReceiptAnalysisRequestSchema = new Schema<ReceiptAnalysisRequestDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  clientId: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  imageUrl: {
    type: String,
    required: true,
    trim: true,
  },
  imageMetadata: {
    type: ImageMetadataSchema,
    required: true,
  },
  status: {
    type: String,
    enum: Object.values(ReceiptStatus),
    default: ReceiptStatus.PENDING,
    index: true,
  },
  metadata: {
    type: RequestMetadataSchema,
  },
}, {
  timestamps: true,
  collection: 'receipt_analysis_requests',
});

// Indexes for performance
ReceiptAnalysisRequestSchema.index({ clientId: 1, createdAt: -1 });
ReceiptAnalysisRequestSchema.index({ status: 1, createdAt: 1 });
ReceiptAnalysisRequestSchema.index({ 'metadata.priority': 1, createdAt: 1 });

// Virtual for converting _id to id
ReceiptAnalysisRequestSchema.virtual('id').get(function(this: any) {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized
ReceiptAnalysisRequestSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc: any, ret: any) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ReceiptAnalysisRequestModel = mongoose.model<ReceiptAnalysisRequestDocument>(
  'ReceiptAnalysisRequest',
  ReceiptAnalysisRequestSchema
);