@extends('backend.layouts.app')

@section('content')
<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper" style="background-image: url('{{ asset('dist/img/attendance.png') }}'); background-size: cover; background-position: center;">
    <!-- Content Header (Page header) -->
    <div class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1>Attendance Report</h1>
                </div><!-- /.col -->
            </div><!-- /.row -->
        </div><!-- /.container-fluid -->
    </div><!-- /.content-header -->

    <section class="content">
        <div class="container-fluid">
            <div class="row">
                <section class="col-md-12">
                    <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                        <form method="get" action="">
                            <div class="card-body">
                                <div class="row">
                                    {{-- <div class="form-group col-md-2">
                                        <label>Employee ID</label>
                                        <input type="text" value="{{ Request::get('employee_id') }}" name="employee_id" class="form-control" placeholder="Enter ID">
                                    </div> --}}
                                    <div class="form-group col-md-2">
                                        <label>Employee Name</label>
                                        <input type="text" value="{{ Request::get('employee_name') }}" name="employee_name" class="form-control" placeholder="Enter Name">
                                    </div>
                                    {{-- <div class="form-group col-md-2">
                                        <label>Attendance Date</label>
                                        <input type="date" id="getAttendanceDate" value="{{ Request::get('attendance_date') }}" name="attendance_date" class="form-control">
                                    </div> --}}
                                    <div class="form-group col-md-2">
                                        <label>Attendance Type</label>
                                        <select class="form-control" name="attendance_type">
                                            <option value="">Select ..</option>
                                            <option {{ (Request::get('attendance_type') == 1) ? 'selected' : '' }} value="1">Present</option>
                                            <option {{ (Request::get('attendance_type') == 2) ? 'selected' : '' }} value="2">Late</option>
                                            <option {{ (Request::get('attendance_type') == 3) ? 'selected' : '' }} value="3">Absent</option>
                                            <option {{ (Request::get('attendance_type') == 4) ? 'selected' : '' }} value="4">Half Day</option>
                                        </select>
                                    </div>


                                    <div class="form-group col-md-2">
                                        <label>  Date  </label>
                                        <input type="date" value="{{ Request()->start_date }}" name="start_date" class="form-control">
                                    </div>

                                    <div class="form-group col-md-2">
                                        <label> To Date  </label>
                                        <input type="date" value="{{ Request()->end_date }}" name="end_date" class="form-control">
                                    </div>


                                    <div class="form-group col-md-3 d-flex align-items-end">
                                        <button class="btn btn-primary" type="submit" style="margin-right: 10px;">
                                            Check
                                        </button>
                                        <a href="{{ url('admin/reports') }}" class="btn btn-success">
                                            Reset
                                        </a>

                                        <a href="{{ route('reports.exportPdf', Request::all()) }}" class="btn btn-danger" style="margin-left: 170px">
                                            <i class="fas fa-file-pdf"></i>PDF
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>




                    @include('_message')

                    <div class="card" style="background-color: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                        <div class="card-header">
                            <h3 class="card-title">Attendance List</h3>
                        </div>
                        <div class="card-body p-0" style="overflow: auto;">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Employee ID</th>
                                        <th>Employee Name</th>
                                        <th>Attendance</th>
                                        <th>Attendance Date</th>
                                        <th>Created Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @forelse ($getRecord as $value)
                                    <tr>
                                        <td>{{ $value->employee_id }}</td>
                                        <td>{{ $value->employee_name }}</td>
                                        <td>
                                            @if ($value->attendance_type == 1)
                                            Present
                                            @elseif($value->attendance_type == 2)
                                            Late
                                            @elseif($value->attendance_type == 3)
                                            Absent
                                            @elseif($value->attendance_type == 4)
                                            Half Day
                                            @endif
                                        </td>
                                        <td>{{ date('d-m-Y', strtotime($value->attendance_date)) }}</td>
                                        <td>{{ date('d-m-Y (h:i A)', strtotime($value->created_at)) }}</td>
                                    </tr>
                                    @empty
                                    <tr>
                                        <td colspan="5">Record not Found</td>
                                    </tr>
                                    @endforelse
                                </tbody>
                            </table>
                            <br>
                            {{-- <div style="padding: 10px; float:right;">
                                {!! $getRecord->appends(Illuminate\Support\Facades\Request::except('page'))->links() !!}
                            </div> --}}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </section>
</div>
@endsection
